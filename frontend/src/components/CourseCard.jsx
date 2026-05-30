import React from 'react';

export default function CourseCard({ course, onClick }) {
  const progress = course.progress_percentage ?? course.progress ?? 0;

  return (
    <div className="course-card" onClick={onClick} style={{ borderLeftColor: course.color || '#3B82F6' }}>
      <div className="course-card-header">
        <span className="course-icon" style={{ backgroundColor: (course.color || '#3B82F6') + '15', color: course.color }}>
          {course.icon === 'code' ? '💻' :
           course.icon === 'monitor' ? '🖥️' :
           course.icon === 'trending-up' ? '📈' :
           course.icon === 'search' ? '🔍' :
           course.icon === 'database' ? '🗄️' :
           course.icon === 'cpu' ? '🧠' :
           course.icon === 'book-open' ? '📖' :
           course.icon === 'globe' ? '🌍' :
           course.icon === 'terminal' ? '⌨️' :
           course.icon === 'share-2' ? '📤' :
           course.icon === 'layout' ? '🎨' :
           course.icon === 'cloud' ? '☁️' : '📚'}
        </span>
        <span className="course-category">{course.category}</span>
      </div>
      <h4 className="course-name">{course.name}</h4>
      {course.tutor_name && <p className="course-tutor">by {course.tutor_name}</p>}
      <div className="course-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: course.color || '#3B82F6' }}
          />
        </div>
        <span className="progress-text">{Math.round(progress)}%</span>
      </div>
      {course.students_count !== undefined && (
        <p className="course-students">{course.students_count} students</p>
      )}
      {course.grade && <span className="course-grade">Grade: {course.grade}</span>}
    </div>
  );
}
